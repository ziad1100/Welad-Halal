import { Injectable, Logger } from '@nestjs/common';

/**
 * Section 3 — Daily summary delivery channels.
 * SYSTEM notification channels only: they never reintroduce email as a login
 * identifier (login remains username-only).
 *
 *  - WhatsApp Business API (Cloud API): set WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID.
 *  - Email (SMTP): set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM.
 *  - If neither is configured the report is logged and still persisted in-app
 *    (Alert DAILY_SUMMARY) so nothing is lost.
 */
@Injectable()
export class SummaryNotifier {
  private readonly logger = new Logger(SummaryNotifier.name);

  async sendWhatsApp(text: string): Promise<boolean> {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const to = process.env.SUMMARY_WHATSAPP_TO;
    if (!token || !phoneNumberId || !to) return false;
    try {
      const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text },
        }),
      });
      if (!res.ok) {
        this.logger.error(`WhatsApp send failed: ${res.status} ${await res.text()}`);
        return false;
      }
      return true;
    } catch (e) {
      this.logger.error(`WhatsApp send error: ${(e as Error).message}`);
      return false;
    }
  }

  async sendEmail(subject: string, text: string): Promise<boolean> {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || user;
    const to = process.env.SUMMARY_EMAIL_TO;
    if (!host || !user || !pass || !to) return false;
    try {
      // Minimal SMTP over net/tls without extra deps — enough for a plain text report.
      const tls = await import('tls');
      const net = await import('net');
      const port = Number(process.env.SMTP_PORT || 587);
      const socket: any = port === 465 ? tls.connect({ host, port }) : net.connect({ host, port });
      await new Promise<void>((res, rej) => { socket.once(port === 465 ? 'secureConnect' : 'connect', res); socket.once('error', rej); });
      if (port !== 465) {
        socket.setEncoding('utf8');
        await this.smtpRead(socket, '220');
        socket.write(`EHLO ${process.env.SMTP_EHLO || 'kstore.local'}\r\n`);
        await this.smtpRead(socket, '250');
        socket.write('STARTTLS\r\n');
        await this.smtpRead(socket, '220');
        const secure = new (tls.TLSSocket)(socket, {});
        await this.smtpWriteEhlo(secure);
        return await this.smtpSend(secure, from!, to, subject, text);
      }
      return await this.smtpSend(socket, from!, to, subject, text);
    } catch (e) {
      this.logger.error(`Email send error: ${(e as Error).message}`);
      return false;
    }
  }

  private async smtpWriteEhlo(secure: any) {
    secure.setEncoding('utf8');
    secure.write(`EHLO ${process.env.SMTP_EHLO || 'kstore.local'}\r\n`);
    await this.smtpRead(secure, '250');
  }

  private async smtpSend(s: any, from: string, to: string, subject: string, text: string) {
    s.write(`AUTH LOGIN\r\n`);
    await this.smtpRead(s, '334');
    s.write(Buffer.from(process.env.SMTP_USER!).toString('base64') + '\r\n');
    await this.smtpRead(s, '334');
    s.write(Buffer.from(process.env.SMTP_PASS!).toString('base64') + '\r\n');
    await this.smtpRead(s, '235');
    s.write(`MAIL FROM:<${from}>\r\n`);
    await this.smtpRead(s, '250');
    s.write(`RCPT TO:<${to}>\r\n`);
    await this.smtpRead(s, '250');
    s.write(`DATA\r\n`);
    await this.smtpRead(s, '354');
    const body = `From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}\r\n.`;
    s.write(body + '\r\n');
    await this.smtpRead(s, '250');
    s.write('QUIT\r\n');
    s.end();
    return true;
  }

  private smtpRead(socket: any, expect: string): Promise<void> {
    return new Promise((res, rej) => {
      const onData = (chunk: string) => {
        if (chunk.startsWith(expect)) { socket.off('data', onData); res(); }
        else if (/^[45]/.test(chunk)) { socket.off('data', onData); rej(new Error(chunk.trim())); }
      };
      socket.on('data', onData);
      setTimeout(() => { socket.off('data', onData); rej(new Error('SMTP timeout')); }, 10000);
    });
  }

  /** Try WhatsApp first, then email; always succeed via log as last resort. */
  async deliver(text: string, subject = 'التقرير اليومي — ولاد حلال'): Promise<'whatsapp' | 'email' | 'log'> {
    if (await this.sendWhatsApp(text)) return 'whatsapp';
    if (await this.sendEmail(subject, text)) return 'email';
    this.logger.log(`Daily summary (no delivery channel configured):\n${text}`);
    return 'log';
  }
}

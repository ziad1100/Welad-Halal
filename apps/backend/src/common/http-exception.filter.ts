import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';

/** Global safety net: explicit HttpExceptions (validation, 401/403/404/409 with
 * safe Arabic messages) pass through untouched; unexpected errors become a
 * generic 500 without leaking stack traces or driver messages to clients. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      // Preserve the { statusCode, message, error } shape Nest clients expect.
      if (typeof body === 'object' && body !== null) {
        // 500s thrown explicitly still pass — but strip stacks if ever attached.
        const { stack, ...rest } = body as Record<string, unknown>;
        void stack;
        return res.status(status).json(rest);
      }
      return res.status(status).json({ statusCode: status, message: body });
    }
    this.logger.error(`Unhandled error: ${(exception as Error)?.stack || String(exception)}`);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'حدث خطأ في الخادم، حاول مرة أخرى',
    });
  }
}

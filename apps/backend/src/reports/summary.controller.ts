import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { RequireLevel } from '../common/level.decorator';
import { SummaryCron } from './summary.cron';

@ApiTags('Reports') @ApiBearerAuth() @UseGuards(AuthGuard) @RequireLevel(100)
@Controller('reports')
export class SummaryController {
  constructor(private cron: SummaryCron) {}

  /** Manual trigger of the daily summary (owner only) — testing/re-delivery. */
  @Post('daily-summary/run')
  run() {
    return this.cron.runNow();
  }
}

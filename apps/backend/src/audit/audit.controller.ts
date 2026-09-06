import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuthGuard } from '../common/auth.guard';
import { Roles } from '../common/roles.decorator';

@ApiTags('Audit') @ApiBearerAuth() @UseGuards(AuthGuard) @Roles('ADMIN', 'MANAGER')
@Controller('audit')
export class AuditController {
  constructor(private svc: AuditService) {}
  @Get() list(@Query('action') action?: string, @Query('take') take?: string) {
    return this.svc.list(action, take ? Number(take) : 200);
  }
}

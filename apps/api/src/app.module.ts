import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AccountingModule } from './accounting/accounting.module';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, AccountingModule],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}

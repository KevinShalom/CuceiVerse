import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SiiauController } from './siiau.controller';
import { SiiauService } from './siiau.service';
import { SiiauSessionCacheService } from './siiau-session-cache.service';
import { SIIAU_PROVIDER } from './siiau.provider';
import { SiiauRealProvider } from './providers/siiau-real.provider';
import { SiiauFixtureProvider } from './providers/siiau-fixture.provider';

@Module({
  imports: [PrismaModule],
  controllers: [SiiauController],
  providers: [
    SiiauService,
    SiiauSessionCacheService,
    SiiauRealProvider,
    SiiauFixtureProvider,
    {
      provide: SIIAU_PROVIDER,
      useFactory: (real: SiiauRealProvider, fixture: SiiauFixtureProvider) => {
        const mode = (process.env.SIIAU_MODE ?? 'real').toLowerCase();
        return mode === 'fixture' ? fixture : real;
      },
      inject: [SiiauRealProvider, SiiauFixtureProvider],
    },
  ],
  exports: [SiiauService, SiiauSessionCacheService],
})
export class SiiauModule {}

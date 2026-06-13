import {
  All,
  Controller,
  Logger,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { KeeperConfig } from '../config/keeper.config';
import { logKeeperError } from '../lib/keeper-log';

/** Forwards /v1/* to leverx-server so the app can use a single URL (port 3001 in docker). */
@Controller('v1')
export class IndexerProxyController {
  private readonly logger = new Logger(IndexerProxyController.name);
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<KeeperConfig>('keeper')!.indexerUrl;
  }

  @All('*path')
  async proxy(@Req() req: Request, @Res() res: Response) {
    const raw = req.params.path;
    const suffix = Array.isArray(raw) ? raw.join('/') : String(raw ?? '');
    const base = this.baseUrl.replace(/\/$/, '');
    const url = new URL(`${base}/v1/${suffix}`);
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') url.searchParams.set(key, value);
    }

    try {
      const upstream = await fetch(url.toString(), {
        method: req.method,
        headers: { accept: 'application/json' },
      });
      const body = await upstream.text();
      res.status(upstream.status);
      res.setHeader(
        'content-type',
        upstream.headers.get('content-type') ?? 'application/json',
      );
      res.send(body);
    } catch (err) {
      logKeeperError(this.logger, `proxy ${url}`, err);
      res.status(502).json({ error: 'indexer_unavailable' });
    }
  }
}

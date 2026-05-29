import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios from 'axios';

export type SoftComputingRouteInput = {
  route_id: string;
  origin: { x: number; y: number };
  destination: { x: number; y: number };
  distance: number;
  crowd: number;
  accessibility: number;
};

type SoftComputingCandidate = {
  route_id: string;
  score: number;
  classification: string;
  reason: string;
  normalized: {
    distance: number;
    crowd: number;
    accessibility: number;
  };
};

type SoftComputingBatchResponse = {
  recommended_route: string;
  score: number;
  classification: string;
  reason: string;
  candidates: SoftComputingCandidate[];
};

@Injectable()
export class SoftComputingService {
  private readonly baseUrl =
    process.env.SOFT_COMPUTING_URL ?? 'http://localhost:8010';

  async healthcheck(): Promise<{ ok: boolean }> {
    try {
      const response = await axios.get(`${this.baseUrl}/health`, {
        timeout: 3_000,
      });
      return { ok: Boolean(response.data?.ok) };
    } catch {
      return { ok: false };
    }
  }

  async recommendBatch(
    routes: SoftComputingRouteInput[],
  ): Promise<SoftComputingBatchResponse> {
    try {
      const response = await axios.post<SoftComputingBatchResponse>(
        `${this.baseUrl}/recommend-batch`,
        { routes },
        { timeout: 8_000 },
      );
      return response.data;
    } catch (error) {
      throw new ServiceUnavailableException(
        `No fue posible consultar el servicio de computo flexible (${this.baseUrl})`,
      );
    }
  }
}

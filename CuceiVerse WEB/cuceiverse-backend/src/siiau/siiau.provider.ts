import { SiiauSnapshotDto, SiiauSnapshotRequestDto } from './dto/siiau.dto';

export const SIIAU_PROVIDER = Symbol('SIIAU_PROVIDER');

export interface SiiauProvider {
  validateCredentials(input: {
    codigo: string;
    nip: string;
  }): Promise<{ ok: boolean; displayName?: string | null }>;

  fetchSnapshot(input: SiiauSnapshotRequestDto): Promise<SiiauSnapshotDto>;
}

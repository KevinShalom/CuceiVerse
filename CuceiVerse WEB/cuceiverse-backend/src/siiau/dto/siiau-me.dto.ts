import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SiiauSnapshotMeRequestDto {
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  nip!: string;

  @IsOptional()
  @IsString()
  carreraPrefer?: string;

  @IsOptional()
  @IsString()
  cicloPrefer?: string;
}

import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAvatarDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  avatarUrl?: string | null;
}

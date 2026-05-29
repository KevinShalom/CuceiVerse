import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class RouteCandidateInputDto {
  @IsOptional()
  @IsString()
  routeId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  distance?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  crowd: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  accessibility: number;
}

export class RecommendRouteDto {
  @IsUUID()
  poiOrigenId: string;

  @IsUUID()
  poiDestinoId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  alternativesLimit?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteCandidateInputDto)
  routeCandidates?: RouteCandidateInputDto[];
}

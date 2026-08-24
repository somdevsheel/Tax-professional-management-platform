import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { ENTITY_TYPES, CLIENT_STATUSES } from "@tax-platform/types";

export class CreateClientDto {
  @IsString()
  @MaxLength(300)
  name!: string;

  @IsIn(ENTITY_TYPES)
  entityType!: (typeof ENTITY_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(20)
  pan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  gstin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  tan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  cin?: string;

  @IsOptional()
  @IsObject()
  address?: Record<string, unknown>;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactPerson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  financialYear?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  assessmentYear?: string;

  @IsOptional()
  @IsIn(CLIENT_STATUSES)
  status?: (typeof CLIENT_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Type(() => String)
  tags?: string[];
}

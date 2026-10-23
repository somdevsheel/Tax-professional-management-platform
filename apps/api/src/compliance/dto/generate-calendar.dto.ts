import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsUUID, Matches } from "class-validator";

const FINANCIAL_YEAR = /^\d{4}-\d{2}$/;

export class GenerateCalendarDto {
  @Matches(FINANCIAL_YEAR, { message: "financialYear must look like 2025-26" })
  financialYear!: string;

  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID("4", { each: true })
  complianceTypeIds!: string[];

  /** Also create filings whose due date has already passed (created as OVERDUE). Off by default:
   *  generating a year that's partly over usually means those filings were already handled. */
  @IsOptional()
  @IsBoolean()
  includePastDue?: boolean;
}

export class GenerateCalendarForAllDto {
  @Matches(FINANCIAL_YEAR, { message: "financialYear must look like 2025-26" })
  financialYear!: string;

  @IsOptional()
  @IsBoolean()
  includePastDue?: boolean;
}

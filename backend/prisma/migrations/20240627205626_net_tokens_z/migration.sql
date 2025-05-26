-- AlterTable
ALTER TABLE "segments" ADD COLUMN     "net_tokens_12_period" DOUBLE PRECISION,
ADD COLUMN     "net_tokens_16_period" DOUBLE PRECISION,
ADD COLUMN     "net_tokens_32_period" DOUBLE PRECISION,
ADD COLUMN     "net_tokens_8_period" DOUBLE PRECISION,
ADD COLUMN     "tokens_pct_change_12_period" DOUBLE PRECISION,
ADD COLUMN     "tokens_pct_change_16_period" DOUBLE PRECISION,
ADD COLUMN     "tokens_pct_change_32_period" DOUBLE PRECISION,
ADD COLUMN     "tokens_pct_change_8_period" DOUBLE PRECISION,
ADD COLUMN     "tokens_pct_change_z_score_12_period" DOUBLE PRECISION,
ADD COLUMN     "tokens_pct_change_z_score_16_period" DOUBLE PRECISION,
ADD COLUMN     "tokens_pct_change_z_score_32_period" DOUBLE PRECISION,
ADD COLUMN     "tokens_pct_change_z_score_8_period" DOUBLE PRECISION;

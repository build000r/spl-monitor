-- CreateTable
CREATE TABLE "score_matrix" (
    "id" TEXT NOT NULL,
    "token_address" TEXT NOT NULL,
    "buy_time" DOUBLE PRECISION NOT NULL,
    "end_time" DOUBLE PRECISION NOT NULL,
    "percent_high" DOUBLE PRECISION,
    "percent_low" DOUBLE PRECISION,
    "score" DOUBLE PRECISION,

    CONSTRAINT "score_matrix_pkey" PRIMARY KEY ("id")
);
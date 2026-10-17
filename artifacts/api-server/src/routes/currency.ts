import { Router, type IRouter } from "express";
import {
  GetCurrencyRatesQueryParams,
  GetCurrencyRatesResponse,
} from "@workspace/api-zod";
import { getCurrencyRates } from "../lib/currency-rates";

const router: IRouter = Router();

router.get("/currency/rates", async (req, res): Promise<void> => {
  const parsed = GetCurrencyRatesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a supported base currency." });
    return;
  }

  try {
    const rates = await getCurrencyRates(
      parsed.data.base,
      parsed.data.refresh === "1",
    );
    res.json(GetCurrencyRatesResponse.parse(rates));
  } catch (error) {
    req.log.warn(
      { err: error, base: parsed.data.base },
      "Unable to retrieve live exchange rates",
    );
    res.status(503).json({
      error: "Live exchange rates are unavailable. Please retry in a moment.",
    });
  }
});

export default router;

import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import App from "./App";
import { db } from "../database/store";
afterEach(cleanup);
it("شروع خالی، تنظیمات قابل ویرایش و ذخیره محلی", async () => {
  await db.documents.clear();
  render(<App />);
  await screen.findByRole("heading", { name: "تصویر مالی تو" });
  expect(screen.getByText("از اولین عدد شروع کن.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "تنظیمات" }));
  fireEvent.change(screen.getByLabelText("موجودی افتتاحیه (تومان)"), {
    target: { value: "۱۲۳۴" },
  });
  fireEvent.click(screen.getByRole("button", { name: "ذخیره تنظیمات" }));
  await waitFor(async () =>
    expect((await db.documents.get("main"))?.data.openingBalance).toBe(12340),
  );
});

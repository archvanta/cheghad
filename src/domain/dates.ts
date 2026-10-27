import * as j from "jalaali-js";
import { isoDate } from "./model";
export function toJalali(date: string) {
  isoDate.parse(date);
  const [y, m, d] = date.split("-").map(Number);
  return j.toJalaali(y, m, d);
}
export function fromJalali(year: number, month: number, day: number) {
  if (!j.isValidJalaaliDate(year, month, day))
    throw Error("تاریخ شمسی معتبر نیست");
  const g = j.toGregorian(year, month, day);
  return isoDate.parse(
    `${g.gy}-${String(g.gm).padStart(2, "0")}-${String(g.gd).padStart(2, "0")}`,
  );
}
export function jalaliDays(year: number, month: number) {
  return j.jalaaliMonthLength(year, month);
}

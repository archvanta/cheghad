import { useState } from "react";
import { today } from "../domain/model";
import { toJalali, fromJalali, jalaliDays } from "../domain/dates";
export default function DateField({
  label,
  name,
  defaultValue = today(),
  min = "1900-01-01",
  max = "2200-12-31",
  calendar = "persian",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  min?: string;
  max?: string;
  calendar?: "persian" | "gregory";
}) {
  const [value, setValue] = useState(defaultValue);
  const j = toJalali(value);
  const start = toJalali(min).jy,
    end = toJalali(max).jy;
  const change = (year: number, month: number, day: number) => {
    const iso = fromJalali(year, month, Math.min(day, jalaliDays(year, month)));
    setValue(iso < min ? min : iso > max ? max : iso);
  };
  if (calendar === "gregory")
    return (
      <label>
        {label}
        <input
          name={name}
          type="date"
          required
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            if (e.target.value) setValue(e.target.value);
          }}
        />
      </label>
    );
  return (
    <fieldset className="date-field">
      <legend>{label} (شمسی)</legend>
      <input type="hidden" name={name} value={value} />
      <div className="date-selects">
        <label>
          روز
          <select
            aria-label={label + " روز"}
            value={j.jd}
            onChange={(e) => change(j.jy, j.jm, Number(e.target.value))}
          >
            {Array.from({ length: jalaliDays(j.jy, j.jm) }, (_, i) => (
              <option key={i} value={i + 1}>
                {new Intl.NumberFormat("fa").format(i + 1)}
              </option>
            ))}
          </select>
        </label>
        <label>
          ماه
          <select
            aria-label={label + " ماه"}
            value={j.jm}
            onChange={(e) => change(j.jy, Number(e.target.value), j.jd)}
          >
            {[
              "فروردین",
              "اردیبهشت",
              "خرداد",
              "تیر",
              "مرداد",
              "شهریور",
              "مهر",
              "آبان",
              "آذر",
              "دی",
              "بهمن",
              "اسفند",
            ].map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          سال
          <select
            aria-label={label + " سال"}
            value={j.jy}
            onChange={(e) => change(Number(e.target.value), j.jm, j.jd)}
          >
            {Array.from({ length: end - start + 1 }, (_, i) => start + i).map(
              (y) => (
                <option key={y} value={y}>
                  {new Intl.NumberFormat("fa", { useGrouping: false }).format(
                    y,
                  )}
                </option>
              ),
            )}
          </select>
        </label>
      </div>
    </fieldset>
  );
}

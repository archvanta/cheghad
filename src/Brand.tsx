export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={"cheghad-brand" + (compact ? " compact" : "")}>
      <img
        src={import.meta.env.BASE_URL + "cheghad-logo.png"}
        alt="نشان چقدر"
        width="64"
        height="64"
      />
      <div>
        <b>چقدر؟</b>
        <small>مدیریت مالی</small>
      </div>
    </div>
  );
}

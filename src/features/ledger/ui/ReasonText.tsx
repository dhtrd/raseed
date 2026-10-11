import { formatDate } from "../../../shared/fields/core/date";

/** نص السبب كما كتبه سكربت النقل، بتواريخه يوماً/شهراً/سنة كبقية النظام وبلا كسر داخل التاريخ. */
export function ReasonText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\d{4}-\d{2}-\d{2})/).map((part, i) =>
        i % 2 ? (
          <span key={i} className="num">
            {formatDate(part)}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

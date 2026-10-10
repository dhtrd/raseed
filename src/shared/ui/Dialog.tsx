import type { ReactNode } from "react";
import { Dialog as AriaDialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import s from "./Dialog.module.css";

export type DialogProps = {
  isOpen: boolean;
  title: ReactNode;
  children: ReactNode;
  /** يُستدعى عند Esc أو النقر خارج النافذة (إن سُمح). */
  onDismiss?: () => void;
  tone?: "default" | "warn";
  /** نافذة تنبيه لا تُغلق إلا بزر صريح (مثل تحذير الخمول). */
  alert?: boolean;
};

/** نافذة وسطى، ولوحة سفلية على الجوال (CHOSEN، DECISIONS 2026-10-10 «نافذة وسطى»). */
export function Dialog(p: DialogProps) {
  return (
    <ModalOverlay
      className={s.overlay}
      isOpen={p.isOpen}
      isDismissable={!p.alert && Boolean(p.onDismiss)}
      isKeyboardDismissDisabled={p.alert || !p.onDismiss}
      onOpenChange={(open) => {
        if (!open) p.onDismiss?.();
      }}
    >
      <Modal className={`${s.modal} ${p.tone === "warn" ? s.warn : ""}`}>
        <AriaDialog className={s.dialog} role={p.alert ? "alertdialog" : "dialog"}>
          <Heading slot="title" className={s.title}>
            {p.title}
          </Heading>
          {p.children}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}

export { s as dialogStyles };

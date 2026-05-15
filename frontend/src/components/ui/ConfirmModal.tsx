import { Modal } from "./Modal";
import { Button } from "./Button";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  open, title, message,
  confirmText = "Confirm", cancelText = "Cancel",
  destructive, onConfirm, onClose
}: Props) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-slate-500 mb-5">{message}</p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>{cancelText}</Button>
        <Button
          variant={destructive ? "danger" : "primary"}
          onClick={() => { onConfirm(); onClose(); }}
        >
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}

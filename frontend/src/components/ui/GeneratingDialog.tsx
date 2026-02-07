import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";

export function GeneratingDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="fixed bottom-4 right-4 px-3 py-2 bg-black text-white rounded">Generating</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded shadow">
          <Dialog.Title className="text-lg font-semibold">Generating</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm">Backend job accepted. Polling for results.</Dialog.Description>
          <div className="mt-4 flex justify-end">
            <Dialog.Close asChild>
              <button className="px-3 py-2 bg-gray-200 rounded">Close</button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

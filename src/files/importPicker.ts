import { t } from "../i18n";
import type { PickedFile } from "../shared/files";
import { FileError } from "../shared/errors";
import { isAbort, mapError, picker } from "./browser";

const importPickerTypes = () => [
  {
    description: t("file.importPickerDescription"),
    accept: {
      "text/html": [".html", ".htm"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
  },
];
/** Largest file we will even read into memory for import. */
const MAX_IMPORT_READ_BYTES = 20 * 1024 * 1024;

async function readPicked(file: File): Promise<PickedFile> {
  if (file.size > MAX_IMPORT_READ_BYTES) {
    throw new FileError("too-large", t("file.tooLarge", { n: MAX_IMPORT_READ_BYTES / 1024 / 1024 }));
  }
  return { name: file.name, buffer: await file.arrayBuffer() };
}

/** Let the user choose a file to import. Returns null on cancel. Format checks happen in the importer. */
export async function pickImportFile(): Promise<PickedFile | null> {
  try {
    const p = picker();
    if (p.showOpenFilePicker) {
      const [handle] = await p.showOpenFilePicker({ types: importPickerTypes(), multiple: false });
      return await readPicked(await handle.getFile());
    }
    return await new Promise<PickedFile | null>((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".html,.htm,.docx";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        readPicked(file).then(resolve, reject);
      };
      input.addEventListener("cancel", () => resolve(null));
      input.click();
    });
  } catch (e) {
    if (isAbort(e)) return null;
    throw mapError(e, t("file.readFailed"));
  }
}

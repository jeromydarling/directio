import { Form } from "react-router";
import { LANG_LABELS } from "~/lib/lang-labels";

type Props = {
  available: string[];
  active: string | null;
};

/**
 * Native chooser. On change, POST the set-lang intent to persist the
 * student's preferredLang server-side, then reload with the new ?lang=
 * so the swap happens server-rendered.
 */
export function StudentLangSwitcher({ available, active }: Props) {
  return (
    <Form method="post" reloadDocument className="flex items-center gap-2">
      <input type="hidden" name="intent" value="set-lang" />
      <label className="sr-only" htmlFor="lang-picker">
        Read in
      </label>
      <select
        id="lang-picker"
        name="lang"
        defaultValue={active ?? ""}
        onChange={(e) => {
          const lang = e.currentTarget.value;
          (e.currentTarget.form as HTMLFormElement).submit();
          const url = new URL(window.location.href);
          if (lang) url.searchParams.set("lang", lang);
          else url.searchParams.delete("lang");
          window.history.replaceState({}, "", url.toString());
        }}
        className="rounded-full border border-ink-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-ink-700 dark:border-ink-700 dark:bg-ink-900/60 dark:text-ink-200"
      >
        <option value="">English</option>
        {available.map((l) => {
          const label = LANG_LABELS[l];
          return (
            <option key={l} value={l}>
              {label?.native ?? l.toUpperCase()}
              {label?.english ? ` · ${label.english}` : ""}
            </option>
          );
        })}
      </select>
    </Form>
  );
}

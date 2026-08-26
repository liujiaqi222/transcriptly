import type { MarkdownFormat } from "@transcriptly/capture";

interface MarkdownFormatPickerProps {
  value: MarkdownFormat;
  onChange(format: MarkdownFormat): void;
}

export function MarkdownFormatPicker({
  value,
  onChange,
}: MarkdownFormatPickerProps) {
  return (
    <fieldset className="format-picker">
      <legend className="sr-only">Local format</legend>
      <span className="format-label" aria-hidden="true">
        Local format
      </span>
      <div className="format-options">
        <label title="Timestamped caption lines">
          <input
            type="radio"
            name="local-markdown-format"
            value="timeline"
            checked={value === "timeline"}
            onChange={() => onChange("timeline")}
          />
          <span>Timeline</span>
        </label>
        <label title="Compact paragraphs with start timestamps">
          <input
            type="radio"
            name="local-markdown-format"
            value="article"
            checked={value === "article"}
            onChange={() => onChange("article")}
          />
          <span>Article</span>
        </label>
      </div>
    </fieldset>
  );
}

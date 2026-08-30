import type { Capture } from "@transcriptly/schema";
import { ArrowRight } from "lucide-react";
import { propertyRows } from "@/entrypoints/popup/utils";

export function CaptureProperties({ capture }: { capture: Capture }) {
  return (
    <details className="properties">
      <summary aria-label="Capture details">
        <span>Details</span>
        <ArrowRight />
      </summary>
      <dl>
        {propertyRows(capture).map((property) => (
          <div className="property" key={property.label}>
            <dt>{property.label}</dt>
            <dd>
              {property.href ? (
                <a href={property.href} target="_blank" rel="noreferrer">
                  {property.value}
                </a>
              ) : (
                property.value
              )}
            </dd>
          </div>
        ))}
        {capture.source.description.trim().length > 0 && (
          <div className="property property-description">
            <dt>Description</dt>
            <dd>
              {capture.source.description.split("\n").map((line, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: description lines are positional
                <p key={index}>{line}</p>
              ))}
            </dd>
          </div>
        )}
      </dl>
    </details>
  );
}

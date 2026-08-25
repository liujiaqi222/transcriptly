import type { Capture } from "@transcriptly/schema";
import { ArrowRight } from "lucide-react";
import { propertyRows } from "@/entrypoints/popup/utils";

export function CaptureProperties({ capture }: { capture: Capture }) {
  return (
    <details className="properties">
      <summary>
        <span>Properties</span>
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
      </dl>
    </details>
  );
}

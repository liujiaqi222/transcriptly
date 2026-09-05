// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtensionErrorBoundary } from "../shared/error-boundary";

describe("ExtensionErrorBoundary", () => {
  afterEach(cleanup);

  it("shows the fallback UI and reports the crash", () => {
    const onError = vi.fn();
    const Boom = () => {
      throw new Error("render exploded");
    };
    render(
      <ExtensionErrorBoundary surface="popup" onError={onError}>
        <Boom />
      </ExtensionErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: "render exploded" }),
      "popup",
    );
  });

  it("Try again re-renders children once they stop throwing", () => {
    const onError = vi.fn();
    let throwing = true;
    const Boom = () => {
      if (throwing) throw new Error("render exploded");
      return <p>recovered</p>;
    };
    render(
      <ExtensionErrorBoundary surface="manager" onError={onError}>
        <Boom />
      </ExtensionErrorBoundary>,
    );

    throwing = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("recovered")).toBeTruthy();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("renders children untouched when nothing throws", () => {
    const onError = vi.fn();
    render(
      <ExtensionErrorBoundary surface="popup" onError={onError}>
        <p>healthy</p>
      </ExtensionErrorBoundary>,
    );

    expect(screen.getByText("healthy")).toBeTruthy();
    expect(onError).not.toHaveBeenCalled();
  });
});

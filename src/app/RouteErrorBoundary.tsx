import { Component } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

class Boundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Boundary
      fallback={
        <div className="flex flex-col gap-6">
          <h1 id="route-heading" tabIndex={-1} className="text-lg font-semibold">
            {t("navigation.error")}
          </h1>
          <Link to="/" className="inline-flex min-h-11 items-center self-start underline">
            {t("navigation.backHome")}
          </Link>
        </div>
      }
    >
      {children}
    </Boundary>
  );
}

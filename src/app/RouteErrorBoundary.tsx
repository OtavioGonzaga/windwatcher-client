import { Component } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

class Boundary extends Component<
  { children: ReactNode; fallback: ReactNode; resetKey: string | undefined },
  { failed: boolean; resetKey: string | undefined }
> {
  state = { failed: false, resetKey: this.props.resetKey };
  static getDerivedStateFromProps(
    props: { resetKey: string | undefined },
    state: { resetKey: string | undefined },
  ) {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function RouteErrorBoundary({
  children,
  resetKey,
}: {
  children: ReactNode;
  resetKey?: string;
}) {
  const { t } = useTranslation();
  return (
    <Boundary
      resetKey={resetKey}
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

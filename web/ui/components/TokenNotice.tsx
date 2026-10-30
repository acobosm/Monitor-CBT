import { useApi, type ApiState, type TokenNoticeData } from "../api";
import { Notice } from "./Notice";

export const TEXT_TOKEN_UNVERIFIED = "No pudimos verificar el token.";

/** R8–R13. If the API itself fails, the notice says so and the rest of the dashboard stays (R12). */
export function TokenNoticeView({ state }: { state: ApiState<TokenNoticeData> }) {
  if (state.kind === "loading" || state.kind === "denied") return null;
  if (state.kind === "error") return <Notice level="amber">{TEXT_TOKEN_UNVERIFIED}</Notice>;
  const { level, label, text, policyText } = state.data;
  return (
    <>
      <Notice level={level}>
        {text}
        {label ? <strong> · {label}</strong> : null}
      </Notice>
      {policyText ? <Notice level="red">{policyText}</Notice> : null}
    </>
  );
}

export function TokenNotice() {
  return <TokenNoticeView state={useApi<TokenNoticeData>("/api/token")} />;
}

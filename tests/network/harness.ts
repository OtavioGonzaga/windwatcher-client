import { ApiClient } from "../../src/shared/api/client";
import { ApiError } from "../../src/shared/api/error";
import { platformHttp } from "../../src/shared/platform/http";
import { ConversationsApi } from "../../src/features/conversations/api";

// This entry is explicitly built only for integration tests, never normal dist/.
export async function probe(baseUrl: string, accessToken?: string) {
  const client = new ApiClient({ baseUrl, transport: await platformHttp() });
  try {
    const data = accessToken
      ? await client.request({
          method: "GET",
          expectedStatuses: [200],
          path: ["instance"],
          accessToken,
          decode: (value) => value,
        })
      : await client.getInstance();
    return { ok: true as const, data };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { ok: false as const, category: error.category, metadata: error.metadata };
  }
}
declare global {
  interface Window {
    networkProbe: typeof probe;
    directProbe: typeof directProbe;
  }
}
window.networkProbe = probe;
async function directProbe(baseUrl: string) {
  try {
    const api = new ConversationsApi(new ApiClient({ baseUrl, transport: await platformHttp() }));
    const result = await api.openDirect(
      "fixture.token.signature",
      "019a0000-0000-7000-8000-000000000001",
      "fixture-only-key",
      {},
    );
    return { ok: true, id: result.id };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { ok: false, category: error.category };
  }
}
window.directProbe = directProbe;

if (new URL(location.href).searchParams.has("native-smoke")) {
  void import("./native-smoke")
    .then(({ nativeSmoke }) => nativeSmoke())
    .catch(() => {
      document.body.textContent = "Native network smoke could not run.";
    });
}

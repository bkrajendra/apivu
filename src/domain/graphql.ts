import type { ApiRequest } from './request';

export type GraphqlBody = {
  query: string;
  /** JSON object as text; may be empty. */
  variables: string;
};

export function createGraphqlBody(): GraphqlBody {
  return { query: '', variables: '' };
}

export function isGraphql(request: ApiRequest): boolean {
  return request.bodyMode === 'graphql';
}

/** Returns the JSON payload for a GraphQL request, or an error message when the variables are not a JSON object. */
export function buildGraphqlPayload(graphql: GraphqlBody | undefined): { body: string } | { error: string } {
  const query = graphql?.query ?? '';
  const variablesText = (graphql?.variables ?? '').trim();
  const payload: { query: string; variables?: unknown } = { query };
  if (variablesText) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(variablesText);
    } catch {
      return { error: 'GraphQL variables must be valid JSON.' };
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { error: 'GraphQL variables must be a JSON object.' };
    }
    payload.variables = parsed;
  }
  return { body: JSON.stringify(payload) };
}

/** Serialises a GraphQL request into a normal JSON-body request (adds Content-Type unless already set). */
export function applyGraphql(request: ApiRequest): { request: ApiRequest } | { error: string } {
  if (!isGraphql(request)) return { request };
  const built = buildGraphqlPayload(request.graphql);
  if ('error' in built) return built;
  const hasContentType = request.headers.some((header) => header.name.toLowerCase() === 'content-type');
  return {
    request: {
      ...request,
      body: built.body,
      headers: hasContentType ? request.headers : [...request.headers, { name: 'Content-Type', value: 'application/json' }],
    },
  };
}

import type { PageLoad } from './$types';

export const ssr = false;
export const prerender = true;

export const load: PageLoad = async () => {
  return { ontology: null as any };
};

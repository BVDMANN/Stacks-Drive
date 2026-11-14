/** ts-resolve-hooks.mjs — hook de résolution pour les scripts de
 *  vérification Node (ex. `verify-lot-f.mjs`) qui importent les
 *  modules `lib/*.ts` tels quels (suppression de types Node 24).
 *
 *  Node ESM exige une extension de fichier dans les imports
 *  relatifs, alors que le code Next.js les écrit sans extension
 *  (`./commission`) : ce hook retente avec `.ts` quand la
 *  résolution directe échoue. Il ne sert qu'aux scripts de
 *  vérification — jamais au code de l'application.
 *
 *  Usage (en tête du script, avant tout import dynamique) :
 *    import { register } from 'node:module';
 *    register('./ts-resolve-hooks.mjs', import.meta.url);
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      !/\.(ts|tsx|js|mjs|json)$/.test(specifier)
    ) {
      return await nextResolve(`${specifier}.ts`, context);
    }
    throw err;
  }
}

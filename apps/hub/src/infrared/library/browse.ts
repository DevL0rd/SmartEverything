import type { IrLibraryBrand, IrLibraryCategory, IrLibraryModel } from '@smarteverything/domain';
import type { IrLibrary } from './ir-library';

export async function libraryCategories(library: IrLibrary): Promise<IrLibraryCategory[]> {
  return (await library.categories()).map(({ name, models }) => ({ category: name, models }));
}

export async function libraryBrands(
  library: IrLibrary,
  category: string,
): Promise<IrLibraryBrand[]> {
  return (await library.brands(category)).map(({ name, models }) => ({ brand: name, models }));
}

export async function libraryModels(
  library: IrLibrary,
  category: string,
  brand: string,
): Promise<IrLibraryModel[]> {
  const entries = await library.entries(category, brand);
  return Promise.all(
    entries.map(async (entry): Promise<IrLibraryModel> => {
      const model = await library.model(entry.id);
      return {
        id: entry.id,
        source: entry.source,
        kind: entry.kind,
        category: entry.category,
        brand: entry.brand,
        models: entry.models,
        buttons: model.kind === 'keys' ? Object.keys(model.keys).sort() : [],
      };
    }),
  );
}

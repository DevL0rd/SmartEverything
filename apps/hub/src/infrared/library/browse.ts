import type { IrLibraryBrand, IrLibraryCategory, IrLibraryModel } from '@smarteverything/domain';
import type { IrLibrary } from './ir-library';

export function libraryCategories(library: IrLibrary): IrLibraryCategory[] {
  return library.categories().map(({ name, models }) => ({ category: name, models }));
}

export function libraryBrands(library: IrLibrary, category: string): IrLibraryBrand[] {
  return library.brands(category).map(({ name, models }) => ({ brand: name, models }));
}

export function libraryModels(
  library: IrLibrary,
  category: string,
  brand: string,
): IrLibraryModel[] {
  return library.entries(category, brand).map((entry) => {
    const model = library.model(entry.id);
    return {
      id: entry.id,
      source: entry.source,
      kind: entry.kind,
      category: entry.category,
      brand: entry.brand,
      models: entry.models,
      buttons: model.kind === 'keys' ? Object.keys(model.keys).sort() : [],
    };
  });
}

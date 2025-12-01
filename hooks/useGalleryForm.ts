
import { GalleryFormSettings } from '../types';
import { useGalleryFormContext } from '../context/GalleryFormContext';

export { type GalleryFormValidationErrors } from '../context/GalleryFormContext';

export const useGalleryForm = (initialState?: Partial<GalleryFormSettings>) => {
    // The state initialization is now handled by the Provider which this hook expects to be wrapped in.
    // initialState passed here might be ignored if the provider is already set up higher, 
    // but in our current refactor, we wrap the form inside the component, so we rely on the context.
    return useGalleryFormContext();
};

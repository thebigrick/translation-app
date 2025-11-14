export interface ProductLocaleQueryOptions {
  pid: number;
  channelId: number;
  locale: string;
  availableLocales: Array<{ code: string }>;
  defaultLocale: string;
}

export interface ProductOptionValue {
  valueId: string;
  label: string;
}

export interface ProductModifierValue {
  valueId: string;
  label: string;
}

export interface ProductCustomField {
  name: string;
  value: string;
}

export interface ProductModifierBase {
  displayName?: string;
  __typename?: string;
  isShared?: boolean;
}

export interface ProductModifierWithValues extends ProductModifierBase {
  values?: ProductModifierValue[];
  removeValues?: string[];
}

export interface ProductCheckboxModifier extends ProductModifierBase {
  fieldValue?: string;
}

export interface ProductTextFieldModifier extends ProductModifierBase {
  defaultValue?: string;
}

export interface ProductNumberFieldModifier extends ProductModifierBase {
  defaultValueFloat?: number;
}

export type ProductModifier = 
  | (ProductModifierWithValues & { __typename?: 'DropdownProductModifier' | 'RadioButtonsProductModifier' | 'RectangleListProductModifier' | 'SwatchProductModifier' | 'PickListProductModifier' })
  | (ProductCheckboxModifier & { __typename?: 'CheckboxProductModifier' })
  | (ProductTextFieldModifier & { __typename?: 'TextFieldProductModifier' | 'MultilineTextFieldProductModifier' })
  | (ProductNumberFieldModifier & { __typename?: 'NumbersOnlyTextFieldProductModifier' })
  | (ProductModifierBase & { __typename?: 'FileUploadProductModifier' | 'DateFieldProductModifier' });

export interface ProductLocaleUpdateOptions {
  locale: string;
  channelId: string | number;
  productId: string | number;
  productData: {
    // Basic product information
    name?: string;
    description?: string;
    pageTitle?: string;
    metaDescription?: string;
    warranty?: string;
    availabilityDescription?: string;
    searchKeywords?: string;
    preOrderMessage?: string;

    // Options
    options?: {
      [optionId: string]: {
        displayName?: string;
        values?: ProductOptionValue[];
        removeValues?: string[];
      };
    };

    // Modifiers
    modifiers?: {
      [modifierId: string]: ProductModifier;
    };

    // Custom fields
    customFields?: {
      [customFieldId: string]: ProductCustomField;
    };

    // Removal operations
    remove?: {
      options?: string[];
      modifiers?: string[];
      customFields?: string[];
    };
  }
}

export interface ProductBasicInformationInput {
  data: {
    name?: string;
    description?: string;
  };
}

export interface ProductSeoInformationInput {
  data: {
    pageTitle?: string;
    metaDescription?: string;
  };
}

export interface ProductStorefrontDetailsInput {
  data: {
    warranty?: string;
    availabilityDescription?: string;
    searchKeywords?: string;
  };
}

export interface ProductPreOrderSettingsInput {
  data: {
    message?: string;
  };
}

export interface ProductCustomFieldOverride {
  customFieldId: string;
  overrides: {
    channelLocaleOverrides: {
      context: {
        channelId: string;
        locale: string;
      };
      data: {
        name: any;
        value: any;
        isVisible: boolean;
      };
    };
  }[];
}

export interface ProductCustomFieldsInput {
  productId: string;
  data: ProductCustomFieldOverride[];
}

export interface ProductOptionValueOverride {
  id: string;
  label: string;
}

export interface ProductOptionOverride {
  optionId: string;
  data: {
    dropdown?: any;
    displayName?: string;
    values?: ProductOptionValueOverride[];
  };
}

export interface ProductOptionsInput {
  productId: string;
  localeContext: {
    channelId: string;
    locale: string;
  };
  data: {
    options: (ProductOptionOverride | null)[];
  };
}

export interface ProductModifierValueOverride {
  id: string;
  label: string;
}

export interface ProductModifierOverride {
  modifierId: string;
  data: any;
}

export interface ProductModifiersInput {
  productId: string;
  localeContext: {
    channelId: string;
    locale: string;
  };
  data: {
    modifiers: (ProductModifierOverride | null)[];
  };
}

export interface RemoveBasicInfoInput {
  overridesToRemove: string[];
}

export interface RemoveOptionsInput {
  productId: string;
  localeContext: {
    channelId: string;
    locale: string;
  };
  data: {
    options: any[];
  };
}

export interface RemoveModifiersInput {
  productId: string;
  localeContext: {
    channelId: string;
    locale: string;
  };
  data: {
    modifiers: any[];
  };
}

export interface RemoveCustomFieldsOverridesInput {
  productId: string;
  data: {
    customFieldId: string;
    channelLocaleContextData: {
      context: {
        channelId: string;
        locale: string;
      };
      attributes: string[];
    };
  }[];
}

export interface UpdateProductLocaleDataVariables {
  channelId: string;
  locale: string;
  input?: ProductBasicInformationInput;
  seoInput?: ProductSeoInformationInput;
  storefrontInput?: ProductStorefrontDetailsInput;
  preOrderInput?: ProductPreOrderSettingsInput;
  customFieldsInput?: ProductCustomFieldsInput;
  optionsInput?: ProductOptionsInput;
  modifiersInput?: ProductModifiersInput;
  removedBasicInfoInput?: RemoveBasicInfoInput;
  removedSeoInput?: RemoveBasicInfoInput;
  removedStorefrontDetailsInput?: RemoveBasicInfoInput;
  removedPreOrderInput?: RemoveBasicInfoInput;
  removedCustomFieldsInput?: RemoveCustomFieldsOverridesInput;
  removedOptionsInput?: RemoveOptionsInput;
  removedModifiersInput?: RemoveModifiersInput;
} 
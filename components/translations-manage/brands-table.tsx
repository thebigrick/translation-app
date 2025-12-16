"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Box,
  Table,
  Input,
  Button,
  Select,
  Flex,
  FlexItem,
  ProgressCircle,
  InlineMessage,
  Text,
} from "@bigcommerce/big-design";
import { SearchIcon, CheckIcon } from "@bigcommerce/big-design-icons";

interface Brand {
  id: number;
  name: string;
  translation: string;
}

type BrandRow = Brand & {
  currentValue: string;
  hasChanges: boolean;
};

interface BrandsTableProps {
  context: string | null;
  channelId: number;
  locale: string;
  defaultLocale: string;
}

export default function BrandsTable({
  context,
  channelId,
  locale,
  defaultLocale,
}: BrandsTableProps) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<{ [key: number]: string }>({});
  const editingValuesRef = useRef(editingValues);

  useEffect(() => {
    editingValuesRef.current = editingValues;
  }, [editingValues]);

  const fetchBrands = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/translations/manage/brands?context=${context}&channelId=${channelId}&locale=${locale}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch brands");
      }

      const data = await response.json();
      console.log('[Brands Table] Fetched data:', data);
      setBrands(data);
    } catch (err: any) {
      setError(err.message || "Failed to load brands");
    } finally {
      setIsLoading(false);
    }
  }, [context, channelId, locale]);

  useEffect(() => {
    if (channelId && locale) {
      fetchBrands();
    }
  }, [channelId, locale, fetchBrands]);

  const handleTranslationChange = useCallback((brandId: number, value: string) => {
    setEditingValues(prev => {
      const newValues = { ...prev };
      newValues[brandId] = value;
      return newValues;
    });
  }, []);

  const handleSave = useCallback(async (brandId: number) => {
    setIsSaving(brandId);
    setError(null);
    setSuccessMessage(null);

    try {
      const translation = editingValuesRef.current[brandId];
      
      const response = await fetch(
        `/api/translations/manage/brands?context=${context}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandId,
            channelId,
            locale,
            translation,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to save translation");
      }

      // Update local state
      setBrands(prev =>
        prev.map(brand =>
          brand.id === brandId ? { ...brand, translation } : brand
        )
      );

      setSuccessMessage("Translation saved successfully");
      setTimeout(() => setSuccessMessage(null), 3000);

      // Clear editing value
      setEditingValues(prev => {
        const newValues = { ...prev };
        delete newValues[brandId];
        return newValues;
      });
    } catch (err: any) {
      setError(err.message || "Failed to save translation");
    } finally {
      setIsSaving(null);
    }
  }, [context, channelId, locale]);

  const filteredBrands = useMemo(
    () => brands.filter(brand =>
      brand.name.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [brands, searchTerm]
  );

  const tableItems = useMemo<BrandRow[]>(
    () =>
      filteredBrands.map((brand) => {
        const editingValue = editingValues[brand.id];
        const currentValue =
          editingValue !== undefined
            ? editingValue
            : brand.translation || "";
        const hasChanges =
          editingValue !== undefined && editingValue !== brand.translation;
        return {
          ...brand,
          currentValue,
          hasChanges,
        };
      }),
    [filteredBrands, editingValues]
  );

  const columns = useMemo(() => [
    {
      header: "ID",
      hash: "id",
      render: (item: BrandRow) => item.id,
      width: 80,
    },
    {
      header: `Name (${defaultLocale})`,
      hash: "name",
      render: (item: BrandRow) => item.name,
    },
    {
      header: `Translation (${locale})`,
      hash: "translation",
      render: (item: BrandRow) => {
        return (
          <Flex alignItems="center">
            <FlexItem flexGrow={1}>
              <Input
                value={item.currentValue}
                onChange={(e) => handleTranslationChange(item.id, e.target.value)}
                placeholder={`Enter ${locale} translation`}
              />
            </FlexItem>
            <FlexItem marginLeft="small">
              <Button
                variant="secondary"
                iconOnly={<CheckIcon />}
                onClick={() => handleSave(item.id)}
                disabled={isSaving === item.id || !item.hasChanges}
                isLoading={isSaving === item.id}
              />
            </FlexItem>
          </Flex>
        );
      },
    },
  ], [defaultLocale, locale, isSaving, handleTranslationChange, handleSave]);

  if (isLoading) {
    return (
      <Flex
        alignItems="center"
        justifyContent="center"
        paddingVertical="xxLarge"
      >
        <ProgressCircle size="large" />
      </Flex>
    );
  }

  return (
    <Box>
      {error && (
        <InlineMessage
          type="error"
          messages={[{ text: error }]}
          marginBottom="medium"
          onClose={() => setError(null)}
        />
      )}

      {successMessage && (
        <InlineMessage
          type="success"
          messages={[{ text: successMessage }]}
          marginBottom="medium"
          onClose={() => setSuccessMessage(null)}
        />
      )}

      <Box marginBottom="medium">
        <Input
          iconLeft={<SearchIcon />}
          placeholder="Search brands..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </Box>

      {filteredBrands.length === 0 ? (
        <Flex
          alignItems="center"
          justifyContent="center"
          flexDirection="column"
          paddingVertical="xxLarge"
        >
          <Text>No brands found</Text>
        </Flex>
      ) : (
        <Table
          columns={columns}
          items={tableItems}
          stickyHeader
          itemName="Brands"
          keyField="id"
        />
      )}
    </Box>
  );
}


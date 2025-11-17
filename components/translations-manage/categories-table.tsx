"use client";

import { useState, useEffect, useCallback } from "react";
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

interface Category {
  id: number;
  name: string;
  translation: string;
}

interface CategoriesTableProps {
  context: string | null;
  channelId: number;
  locale: string;
  defaultLocale: string;
}

export default function CategoriesTable({
  context,
  channelId,
  locale,
  defaultLocale,
}: CategoriesTableProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<{ [key: number]: string }>({});

  const fetchCategories = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/translations/manage/categories?context=${context}&channelId=${channelId}&locale=${locale}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch categories");
      }

      const data = await response.json();
      setCategories(data);
    } catch (err: any) {
      setError(err.message || "Failed to load categories");
    } finally {
      setIsLoading(false);
    }
  }, [context, channelId, locale]);

  useEffect(() => {
    if (channelId && locale) {
      fetchCategories();
    }
  }, [channelId, locale, fetchCategories]);

  const handleTranslationChange = (categoryId: number, value: string) => {
    setEditingValues(prev => {
      const newValues = { ...prev };
      newValues[categoryId] = value;
      return newValues;
    });
  };

  const handleSave = async (categoryId: number) => {
    setIsSaving(categoryId);
    setError(null);
    setSuccessMessage(null);

    try {
      const translation = editingValues[categoryId];
      
      const response = await fetch(
        `/api/translations/manage/categories?context=${context}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryId,
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
      setCategories(prev =>
        prev.map(cat =>
          cat.id === categoryId ? { ...cat, translation } : cat
        )
      );

      setSuccessMessage("Translation saved successfully");
      setTimeout(() => setSuccessMessage(null), 3000);

      // Clear editing value
      setEditingValues(prev => {
        const newValues = { ...prev };
        delete newValues[categoryId];
        return newValues;
      });
    } catch (err: any) {
      setError(err.message || "Failed to save translation");
    } finally {
      setIsSaving(null);
    }
  };

  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    {
      header: "ID",
      hash: "id",
      render: (item: Category) => item.id,
      width: 80,
    },
    {
      header: `Name (${defaultLocale})`,
      hash: "name",
      render: (item: Category) => item.name,
    },
    {
      header: `Translation (${locale})`,
      hash: "translation",
      render: (item: Category) => {
        const currentValue = item.id in editingValues 
          ? editingValues[item.id] 
          : item.translation;
        const hasChanges = item.id in editingValues && editingValues[item.id] !== item.translation;
        
        return (
          <Flex alignItems="center">
            <FlexItem flexGrow={1}>
              <Input
                value={currentValue}
                onChange={(e) => handleTranslationChange(item.id, e.target.value)}
                placeholder={`Enter ${locale} translation`}
              />
            </FlexItem>
            <FlexItem marginLeft="small">
              <Button
                variant="secondary"
                iconOnly={<CheckIcon />}
                onClick={() => handleSave(item.id)}
                disabled={isSaving === item.id || !hasChanges}
                isLoading={isSaving === item.id}
              />
            </FlexItem>
          </Flex>
        );
      },
    },
  ];

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
          placeholder="Search categories..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </Box>

      {filteredCategories.length === 0 ? (
        <Flex
          alignItems="center"
          justifyContent="center"
          flexDirection="column"
          paddingVertical="xxLarge"
        >
          <Text>No categories found</Text>
        </Flex>
      ) : (
        <Table
          columns={columns}
          items={filteredCategories}
          stickyHeader
          itemName="Categories"
        />
      )}
    </Box>
  );
}


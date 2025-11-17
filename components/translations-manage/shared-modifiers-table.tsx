"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Box,
  Table,
  Input,
  Button,
  Flex,
  FlexItem,
  ProgressCircle,
  InlineMessage,
  Text,
} from "@bigcommerce/big-design";
import { SearchIcon, CheckIcon, ArrowDropDownIcon } from "@bigcommerce/big-design-icons";

interface ModifierValue {
  id: string;
  label: string;
  translation: string;
}

interface SharedModifier {
  id: string;
  displayName: string;
  translation: string;
  values: ModifierValue[];
  __typename: string;
}

type SharedModifierRow = SharedModifier & {
  currentValue: string;
  hasChanges: boolean;
  numericId: string;
};

interface SharedModifiersTableProps {
  context: string | null;
  channelId: number;
  locale: string;
  defaultLocale: string;
}

export default function SharedModifiersTable({
  context,
  channelId,
  locale,
  defaultLocale,
}: SharedModifiersTableProps) {
  const [modifiers, setModifiers] = useState<SharedModifier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<{ [key: string]: string }>({});
  const [expandedModifiers, setExpandedModifiers] = useState<Set<string>>(new Set());
  const editingValuesRef = useRef(editingValues);

  useEffect(() => {
    editingValuesRef.current = editingValues;
  }, [editingValues]);

  const fetchModifiers = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/translations/manage/shared-modifiers?context=${context}&channelId=${channelId}&locale=${locale}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch shared modifiers");
      }

      const data = await response.json();
      setModifiers(data);
    } catch (err: any) {
      setError(err.message || "Failed to load shared modifiers");
    } finally {
      setIsLoading(false);
    }
  }, [context, channelId, locale]);

  useEffect(() => {
    if (channelId && locale) {
      fetchModifiers();
    }
  }, [channelId, locale, fetchModifiers]);

  const handleTranslationChange = useCallback((key: string, value: string) => {
    setEditingValues(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSaveModifier = useCallback(async (modifierId: string) => {
    setIsSaving(modifierId);
    setError(null);
    setSuccessMessage(null);

    try {
      const translation = editingValuesRef.current[modifierId];
      
      const response = await fetch(
        `/api/translations/manage/shared-modifiers?context=${context}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modifierId,
            channelId,
            locale,
            translation,
            type: "displayName",
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to save translation");
      }

      setModifiers(prev =>
        prev.map(mod =>
          mod.id === modifierId ? { ...mod, translation } : mod
        )
      );

      setSuccessMessage("Translation saved successfully");
      setTimeout(() => setSuccessMessage(null), 3000);

      setEditingValues(prev => {
        const newValues = { ...prev };
        delete newValues[modifierId];
        return newValues;
      });
    } catch (err: any) {
      setError(err.message || "Failed to save translation");
    } finally {
      setIsSaving(null);
    }
  }, [context, channelId, locale]);

  const handleSaveValue = useCallback(async (modifierId: string, valueId: string) => {
    const key = `${modifierId}:${valueId}`;
    setIsSaving(key);
    setError(null);
    setSuccessMessage(null);

    try {
      const translation = editingValuesRef.current[key];
      
      const response = await fetch(
        `/api/translations/manage/shared-modifiers?context=${context}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modifierId,
            valueId,
            channelId,
            locale,
            translation,
            type: "value",
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to save translation");
      }

      setModifiers(prev =>
        prev.map(mod =>
          mod.id === modifierId
            ? {
                ...mod,
                values: mod.values.map(val =>
                  val.id === valueId ? { ...val, translation } : val
                ),
              }
            : mod
        )
      );

      setSuccessMessage("Translation saved successfully");
      setTimeout(() => setSuccessMessage(null), 3000);

      setEditingValues(prev => {
        const newValues = { ...prev };
        delete newValues[key];
        return newValues;
      });
    } catch (err: any) {
      setError(err.message || "Failed to save translation");
    } finally {
      setIsSaving(null);
    }
  }, [context, channelId, locale]);

  const toggleExpanded = useCallback((modifierId: string) => {
    setExpandedModifiers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(modifierId)) {
        newSet.delete(modifierId);
      } else {
        newSet.add(modifierId);
      }
      return newSet;
    });
  }, []);

  const filteredModifiers = useMemo(
    () => modifiers.filter(mod =>
      mod.displayName.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [modifiers, searchTerm]
  );

  const computedModifiers = useMemo<SharedModifierRow[]>(
    () =>
      filteredModifiers.map((modifier) => {
        const editingValue = editingValues[modifier.id];
        const currentValue =
          editingValue !== undefined
            ? editingValue
            : modifier.translation || "";
        const hasChanges =
          editingValue !== undefined && editingValue !== modifier.translation;
        const numericId = modifier.id.split("/").pop() || modifier.id;

        return {
          ...modifier,
          currentValue,
          hasChanges,
          numericId,
        };
      }),
    [filteredModifiers, editingValues]
  );

  const columns = useMemo(() => [
    {
      header: "",
      hash: "expand",
      render: (item: SharedModifierRow) =>
        item.values.length > 0 ? (
          <Button
            variant="subtle"
            iconOnly={<ArrowDropDownIcon />}
            onClick={() => toggleExpanded(item.id)}
          />
        ) : null,
      width: 50,
    },
    {
      header: "ID",
      hash: "id",
      render: (item: SharedModifierRow) => item.numericId,
      width: 80,
    },
    {
      header: `Display Name (${defaultLocale})`,
      hash: "displayName",
      render: (item: SharedModifierRow) => item.displayName,
    },
    {
      header: `Translation (${locale})`,
      hash: "translation",
      render: (item: SharedModifierRow) => (
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
              onClick={() => handleSaveModifier(item.id)}
              disabled={isSaving === item.id || !item.hasChanges}
              isLoading={isSaving === item.id}
            />
          </FlexItem>
        </Flex>
      ),
    },
  ], [defaultLocale, locale, isSaving, handleTranslationChange, handleSaveModifier, toggleExpanded]);

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
          placeholder="Search shared modifiers..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </Box>

      {computedModifiers.length === 0 ? (
        <Flex
          alignItems="center"
          justifyContent="center"
          flexDirection="column"
          paddingVertical="xxLarge"
        >
          <Text>No shared modifiers found</Text>
        </Flex>
      ) : (
        <Box>
          {computedModifiers.map((modifier) => (
            <Box key={modifier.id} marginBottom="medium">
              <Table
                columns={columns}
                items={[modifier]}
                stickyHeader={false}
                keyField="id"
              />
              
              {expandedModifiers.has(modifier.id) && modifier.values.length > 0 && (
                <Box
                  marginLeft="xxLarge"
                  marginTop="small"
                  marginBottom="small"
                  padding="medium"
                  backgroundColor="secondary10"
                  borderRadius="normal"
                >
                  <Text bold marginBottom="small">Values:</Text>
                  {modifier.values.map((value) => {
                    const key = `${modifier.id}:${value.id}`;
                    const numericValueId = value.id.split("/").pop();
                    const currentValue = key in editingValues 
                      ? editingValues[key] 
                      : value.translation;
                    const hasChanges = key in editingValues && editingValues[key] !== value.translation;
                    
                    return (
                      <Flex
                        key={value.id}
                        alignItems="center"
                        marginBottom="small"
                      >
                        <FlexItem flexBasis="80px">
                          <Text color="secondary60">{numericValueId}</Text>
                        </FlexItem>
                        <FlexItem flexGrow={1}>
                          <Text>{value.label}</Text>
                        </FlexItem>
                        <FlexItem flexGrow={1}>
                          <Input
                            value={currentValue}
                            onChange={(e) =>
                              handleTranslationChange(key, e.target.value)
                            }
                            placeholder={`Enter ${locale} translation`}
                          />
                        </FlexItem>
                        <FlexItem marginLeft="small">
                          <Button
                            variant="secondary"
                            iconOnly={<CheckIcon />}
                            onClick={() => handleSaveValue(modifier.id, value.id)}
                            disabled={isSaving === key || !hasChanges}
                            isLoading={isSaving === key}
                          />
                        </FlexItem>
                      </Flex>
                    );
                  })}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}


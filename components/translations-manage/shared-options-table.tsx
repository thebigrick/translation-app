"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  Collapse,
} from "@bigcommerce/big-design";
import { SearchIcon, CheckIcon, ArrowDropDownIcon } from "@bigcommerce/big-design-icons";

interface OptionValue {
  id: string;
  label: string;
  translation: string;
}

interface SharedOption {
  id: string;
  displayName: string;
  translation: string;
  values: OptionValue[];
  __typename: string;
}

interface SharedOptionsTableProps {
  context: string | null;
  channelId: number;
  locale: string;
  defaultLocale: string;
}

export default function SharedOptionsTable({
  context,
  channelId,
  locale,
  defaultLocale,
}: SharedOptionsTableProps) {
  const [options, setOptions] = useState<SharedOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<{ [key: string]: string }>({});
  const [expandedOptions, setExpandedOptions] = useState<Set<string>>(new Set());

  const fetchOptions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/translations/manage/shared-options?context=${context}&channelId=${channelId}&locale=${locale}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch shared options");
      }

      const data = await response.json();
      console.log('[Shared Options Table] Fetched data:', data);
      setOptions(data);
    } catch (err: any) {
      setError(err.message || "Failed to load shared options");
    } finally {
      setIsLoading(false);
    }
  }, [context, channelId, locale]);

  useEffect(() => {
    if (channelId && locale) {
      fetchOptions();
    }
  }, [channelId, locale, fetchOptions]);

  const handleTranslationChange = useCallback((key: string, value: string) => {
    setEditingValues(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSaveOption = useCallback(async (optionId: string) => {
    setIsSaving(optionId);
    setError(null);
    setSuccessMessage(null);

    try {
      const translation = editingValues[optionId];
      
      const response = await fetch(
        `/api/translations/manage/shared-options?context=${context}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            optionId,
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

      setOptions(prev =>
        prev.map(opt =>
          opt.id === optionId ? { ...opt, translation } : opt
        )
      );

      setSuccessMessage("Translation saved successfully");
      setTimeout(() => setSuccessMessage(null), 3000);

      setEditingValues(prev => {
        const newValues = { ...prev };
        delete newValues[optionId];
        return newValues;
      });
    } catch (err: any) {
      setError(err.message || "Failed to save translation");
    } finally {
      setIsSaving(null);
    }
  }, [context, channelId, locale, editingValues, options]);

  const handleSaveValue = useCallback(async (optionId: string, valueId: string) => {
    const key = `${optionId}:${valueId}`;
    setIsSaving(key);
    setError(null);
    setSuccessMessage(null);

    try {
      const translation = editingValues[key];
      
      const response = await fetch(
        `/api/translations/manage/shared-options?context=${context}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            optionId,
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

      setOptions(prev =>
        prev.map(opt =>
          opt.id === optionId
            ? {
                ...opt,
                values: opt.values.map(val =>
                  val.id === valueId ? { ...val, translation } : val
                ),
              }
            : opt
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
  }, [context, channelId, locale, editingValues, options]);

  const toggleExpanded = useCallback((optionId: string) => {
    setExpandedOptions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(optionId)) {
        newSet.delete(optionId);
      } else {
        newSet.add(optionId);
      }
      return newSet;
    });
  }, []);

  const filteredOptions = useMemo(
    () => options.filter(opt =>
      opt.displayName.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [options, searchTerm]
  );

  const columns = useMemo(() => [
    {
      header: "",
      hash: "expand",
      render: (item: SharedOption) =>
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
      render: (item: SharedOption) => {
        const numericId = item.id.split("/").pop();
        return numericId;
      },
      width: 80,
    },
    {
      header: `Display Name (${defaultLocale})`,
      hash: "displayName",
      render: (item: SharedOption) => item.displayName,
    },
    {
      header: `Translation (${locale})`,
      hash: "translation",
      render: (item: SharedOption) => {
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
                onClick={() => handleSaveOption(item.id)}
                disabled={isSaving === item.id || !hasChanges}
                isLoading={isSaving === item.id}
              />
            </FlexItem>
          </Flex>
        );
      },
    },
  ], [defaultLocale, locale, editingValues, isSaving, handleTranslationChange, handleSaveOption, toggleExpanded, expandedOptions]);

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
          placeholder="Search shared options..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </Box>

      {filteredOptions.length === 0 ? (
        <Flex
          alignItems="center"
          justifyContent="center"
          flexDirection="column"
          paddingVertical="xxLarge"
        >
          <Text>No shared options found</Text>
        </Flex>
      ) : (
        <Box>
          {filteredOptions.map((option) => (
            <Box key={option.id} marginBottom="medium">
              <Table
                columns={columns}
                items={[option]}
                stickyHeader={false}
              />
              
              {expandedOptions.has(option.id) && option.values.length > 0 && (
                <Box
                  marginLeft="xxLarge"
                  marginTop="small"
                  marginBottom="small"
                  padding="medium"
                  backgroundColor="secondary10"
                  borderRadius="normal"
                >
                  <Text bold marginBottom="small">Values:</Text>
                  {option.values.map((value) => {
                    const key = `${option.id}:${value.id}`;
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
                            onClick={() => handleSaveValue(option.id, value.id)}
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


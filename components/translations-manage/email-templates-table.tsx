"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Box,
  Table,
  Input,
  Button,
  Flex,
  ProgressCircle,
  InlineMessage,
  Text,
} from "@bigcommerce/big-design";
import { SearchIcon } from "@bigcommerce/big-design-icons";
import { getTemplateTypeDisplayName } from "@/lib/utils/email-template-helpers";

interface EmailTemplate {
  name: string;
  typeId: string;
  subject: string;
  body: string;
  hasTranslation: boolean;
  keys: Record<string, string>;
  originalSubject: string;
  originalBody: string;
}

interface EmailTemplatesTableProps {
  context: string | null;
  channelId: number;
  locale: string;
  defaultLocale: string;
}

export default function EmailTemplatesTable({
  context,
  channelId,
  locale,
  defaultLocale,
}: EmailTemplatesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const url = `/api/translations/manage/email-templates?context=${context}&channelId=${channelId}&locale=${locale}`;
      console.log('[Email Templates Table] Fetching from:', url);
      
      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[Email Templates Table] API error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
        });
        throw new Error(errorData.error || `Failed to fetch email templates (${response.status})`);
      }

      const data = await response.json();
      console.log('[Email Templates Table] Fetched data:', {
        count: Array.isArray(data) ? data.length : 'not an array',
        data,
      });
      
      // Ensure data is an array
      if (Array.isArray(data)) {
        setTemplates(data);
      } else if (data && typeof data === 'object') {
        // If it's an error object, show it
        if (data.error) {
          setError(data.error);
          setTemplates([]);
        } else {
          // Single template or unexpected structure
          setTemplates([data]);
        }
      } else {
        setTemplates([]);
      }
    } catch (err: any) {
      console.error('[Email Templates Table] Fetch error:', err);
      setError(err.message || "Failed to load email templates");
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  }, [context, channelId, locale]);

  useEffect(() => {
    // channelId can be 0 for global templates, so check for null/undefined explicitly
    if (channelId !== null && channelId !== undefined && locale) {
      fetchTemplates();
    }
  }, [channelId, locale, fetchTemplates]);

  const handleTemplateClick = (templateName: string) => {
    const params = new URLSearchParams();
    if (context) params.set("context", context);
    params.set("channelId", channelId.toString());
    params.set("locale", locale);
    params.set("defaultLocale", defaultLocale);
    
    router.push(
      `/translations/manage/email-templates/${encodeURIComponent(templateName)}?${params.toString()}`
    );
  };

  const filteredTemplates = useMemo(
    () =>
      templates.filter(
        (template) =>
          template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          getTemplateTypeDisplayName(template.typeId)
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
      ),
    [templates, searchTerm]
  );

  const tableItems = useMemo(
    () =>
      filteredTemplates.map((template) => ({
        ...template,
        displayName: getTemplateTypeDisplayName(template.typeId),
      })),
    [filteredTemplates]
  );

  const columns = useMemo(
    () => [
      {
        header: "Template Name",
        hash: "name",
        render: (item: typeof tableItems[0]) => (
          <Text bold>{item.displayName}</Text>
        ),
        width: 300,
      },
      {
        header: "Code",
        hash: "code",
        render: (item: typeof tableItems[0]) => (
          <Text color="secondary60" style={{ fontFamily: "monospace" }}>
            {item.name}
          </Text>
        ),
        width: 300,
      },
      {
        header: "Actions",
        hash: "actions",
        render: (item: typeof tableItems[0]) => (
          <Button
            variant="secondary"
            onClick={() => handleTemplateClick(item.name)}
          >
            Edit Translation
          </Button>
        ),
        width: 150,
      },
    ],
    []
  );

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

      <Box marginBottom="medium">
        <Input
          iconLeft={<SearchIcon />}
          placeholder="Search email templates..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </Box>

      {isLoading ? (
        <Flex
          alignItems="center"
          justifyContent="center"
          paddingVertical="xxLarge"
        >
          <ProgressCircle size="large" />
        </Flex>
      ) : filteredTemplates.length === 0 ? (
        <Flex
          alignItems="center"
          justifyContent="center"
          flexDirection="column"
          paddingVertical="xxLarge"
        >
          <Text>
            {searchTerm ? "No templates match your search" : "No email templates found"}
          </Text>
        </Flex>
      ) : (
        <Table
          columns={columns}
          items={tableItems}
          stickyHeader
          itemName="Email Templates"
          keyField="name"
        />
      )}
    </Box>
  );
}


"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Box,
  Input,
  Button,
  Flex,
  FlexItem,
  Grid,
  GridItem,
  ProgressCircle,
  InlineMessage,
  Text,
  H2,
  H3,
  Link,
} from "@bigcommerce/big-design";
import { Header, Page } from "@bigcommerce/big-design-patterns";
import { getTemplateTypeDisplayName, extractTranslationKeys, extractReadableText } from "@/lib/utils/email-template-helpers";
import { LoadingScreen } from "@/components/loading-indicator";
import { Suspense } from "react";
import HtmlEditor from "@/components/html-editor";

interface EmailTemplate {
  name: string;
  typeId: string;
  subject: string;
  body: string;
  hasTranslation: boolean;
  keys: Record<string, string>;
  defaultValues?: Record<string, string>;
  originalSubject: string;
  originalBody: string;
}

function EmailTemplateDetailContent({
  templateName,
}: {
  templateName: string;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const context = searchParams?.get("context");
  const channelId = searchParams?.get("channelId");
  const locale = searchParams?.get("locale");
  const defaultLocale = searchParams?.get("defaultLocale") || "en";

  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editingKeys, setEditingKeys] = useState<Record<string, string>>({});
  const [availableKeys, setAvailableKeys] = useState<string[]>([]);
  const [storeHash, setStoreHash] = useState<string | null>(null);

  const fetchTemplate = useCallback(async () => {
    if (!context || !channelId || !locale) {
      setError("Missing required parameters");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const url = `/api/translations/manage/email-templates?context=${context}&channelId=${channelId}&locale=${locale}`;
      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Failed to fetch email template (${response.status})`
        );
      }

      const data = await response.json();
      const foundTemplate = Array.isArray(data)
        ? data.find((t: EmailTemplate) => t.name === templateName)
        : null;

      if (!foundTemplate) {
        throw new Error("Template not found");
      }

      setTemplate(foundTemplate);
      
      // Extract available keys from the body HTML
      const keys = extractTranslationKeys(foundTemplate.originalBody || foundTemplate.body || '');
      setAvailableKeys(keys);
      
      // Initialize editing keys with existing translations or empty strings
      const initialKeys: Record<string, string> = {};
      keys.forEach(key => {
        initialKeys[key] = foundTemplate.keys?.[key] || '';
      });
      setEditingKeys(initialKeys);
    } catch (err: any) {
      console.error("[Email Template Detail] Fetch error:", err);
      setError(err.message || "Failed to load email template");
    } finally {
      setIsLoading(false);
    }
  }, [context, channelId, locale, templateName]);

  useEffect(() => {
    if (context && channelId && locale) {
      fetchTemplate();
    }
  }, [fetchTemplate]);

  // Fetch store hash for building edit URL
  useEffect(() => {
    if (!context) return;

    const fetchStoreHash = async () => {
      try {
        const params = new URLSearchParams();
        if (context) params.set("context", context);
        const response = await fetch(`/api/store-hash?${params.toString()}`);
        
        if (!response.ok) {
          throw new Error("Failed to fetch store hash");
        }
        
        const data = await response.json();
        setStoreHash(data.storeHash || null);
      } catch (error) {
        console.error("[Email Template Detail] Unable to fetch store hash:", error);
        setStoreHash(null);
      }
    };

    fetchStoreHash();
  }, [context]);

  const handleSave = useCallback(async () => {
    if (!template || !context || !channelId || !locale) return;

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(
        `/api/translations/manage/email-templates?context=${context}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateName: template.name,
            channelId: Number(channelId),
            locale,
            keys: editingKeys,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `Failed to save translation (${response.status})`;
        const errorDetails = errorData.details ? JSON.stringify(errorData.details, null, 2) : '';
        throw new Error(errorMessage + (errorDetails ? `\n\nDetails: ${errorDetails}` : ''));
      }

      setTemplate({
        ...template,
        keys: editingKeys,
        hasTranslation: true,
      });

      setSuccessMessage("Translation saved successfully");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to save translation");
    } finally {
      setIsSaving(false);
    }
  }, [context, channelId, locale, template, editingKeys]);

  const hasChanges = template && Object.keys(editingKeys).some(
    key => editingKeys[key] !== (template.keys?.[key] || '')
  );

  const handleBack = () => {
    const params = new URLSearchParams();
    if (context) params.set("context", context);
    if (channelId) params.set("channelId", channelId);
    if (locale) params.set("locale", locale);
    router.push(`/translations/manage?${params.toString()}#email-templates`);
  };

  if (isLoading) {
    return (
      <Page>
        <Header title="Email Template Translation" />
        <Flex
          alignItems="center"
          justifyContent="center"
          paddingVertical="xxLarge"
        >
          <ProgressCircle size="large" />
        </Flex>
      </Page>
    );
  }

  if (!template) {
    return (
      <Page>
        <Header title="Email Template Translation" />
        <Box padding="large">
          <InlineMessage
            type="error"
            messages={[{ text: error || "Template not found" }]}
            marginBottom="medium"
          />
          <Button onClick={handleBack}>Back to Templates</Button>
        </Box>
      </Page>
    );
  }

  return (
    <Page>
      <Header
        title={`${getTemplateTypeDisplayName(template.typeId)} - Translation`}
        backLink={{
          text: "Back to Email Templates",
          onClick: handleBack,
          href: "#",
        }}
      />

      <Box padding="large">
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

        <Text color="secondary60" marginBottom="large">
          Template: {template.name}
        </Text>

        {/* Template Preview - Above */}
        <Box 
          border="box" 
          padding="large" 
          borderRadius="normal"
          marginBottom="large"
          style={{ 
            display: 'flex', 
            flexDirection: 'column',
            minWidth: 0,
            overflow: 'hidden',
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box'
          }}
        >
          <Flex justifyContent="space-between" alignItems="center" marginBottom="medium">
            <H3 marginBottom="none">Template Preview ({defaultLocale})</H3>
            {template && storeHash && (
              <Link 
                href={`https://store-${storeHash}.mybigcommerce.com/manage/transactional-emails/${template.name}/edit`}
                external
                target="_blank"
              >
                Edit Template
              </Link>
            )}
          </Flex>
          <Box marginBottom="medium" style={{ minWidth: 0, width: '100%', maxWidth: '100%' }}>
            <Text bold marginBottom="small">Subject</Text>
            <Box 
              padding="small" 
              backgroundColor="secondary10" 
              borderRadius="normal"
              style={{ 
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box'
              }}
            >
              <Text style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                {extractReadableText(template.originalSubject || '', template.defaultValues || {}) || "(empty)"}
              </Text>
            </Box>
          </Box>
          <Box style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            width: '100%',
            maxWidth: '100%',
            height: '400px'
          }}>
            <Text bold marginBottom="small">Body</Text>
            <Box 
              padding="small" 
              backgroundColor="secondary10" 
              borderRadius="normal"
              style={{ 
                height: '100%',
                overflow: 'hidden', 
                minHeight: 0,
                minWidth: 0,
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <Box style={{ 
                width: '100%', 
                maxWidth: '100%',
                minWidth: 0,
                height: '100%',
                minHeight: 0,
                overflow: 'hidden',
                boxSizing: 'border-box'
              }}>
                <HtmlEditor
                  value={template.originalBody || ""}
                  readOnly={true}
                  height="100%"
                />
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Translation Keys - Below */}
        <Box 
          border="box" 
          padding="large" 
          borderRadius="normal" 
          marginBottom="large"
          style={{ 
            display: 'flex', 
            flexDirection: 'column'
          }}
        >
          <H3 marginBottom="medium">Translation Keys ({locale})</H3>
          
          {availableKeys.length === 0 ? (
            <Text color="secondary60">
              No translation keys found in this template. Translation keys are defined using the {"{{lang \"key_name\" ...}}"} syntax in the template body.
            </Text>
          ) : (
            <Box>
              {availableKeys.map((key) => {
                const defaultValue = template.defaultValues?.[key] || '';
                return (
                  <Box key={key} marginBottom="small" paddingBottom="small" style={{ borderBottom: '1px solid #e5e5e5' }}>
                    <Flex flexGap="small" alignItems="flex-start">
                      <FlexItem flexShrink={0} style={{ minWidth: '180px', maxWidth: '250px', paddingTop: '8px' }}>
                        <Text bold style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                          {key}
                        </Text>
                      </FlexItem>
                      <FlexItem flexGrow={1}>
                        <Box>
                          <Input
                            value={editingKeys[key] || ''}
                            onChange={(e) => setEditingKeys({
                              ...editingKeys,
                              [key]: e.target.value,
                            })}
                            placeholder={defaultValue || `Enter translation for "${key}"`}
                          />
                          {defaultValue && (
                            <Box
                              marginTop="xSmall"
                              padding="xSmall"
                              backgroundColor="secondary10"
                              borderRadius="normal"
                              style={{
                                border: '1px solid #d5d5d5',
                                wordBreak: 'break-word',
                                lineHeight: '1.3'
                              }}
                            >
                              <div style={{ fontSize: '10px', color: '#6b7280' }}>
                                <span style={{ fontWeight: 'bold' }}>{defaultLocale}:</span> {defaultValue}
                              </div>
                            </Box>
                          )}
                        </Box>
                      </FlexItem>
                    </Flex>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>

        {/* Save Button */}
        <Flex justifyContent="flex-end" marginTop="large">
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!hasChanges || isSaving || availableKeys.length === 0}
            isLoading={isSaving}
          >
            Save Translation
          </Button>
        </Flex>
      </Box>
    </Page>
  );
}

export default function EmailTemplateDetail({
  params,
}: {
  params: Promise<{ templateName: string }>;
}) {
  const resolvedParams = use(params);
  return (
    <Suspense fallback={<LoadingScreen />}>
      <EmailTemplateDetailContent
        templateName={decodeURIComponent(resolvedParams.templateName)}
      />
    </Suspense>
  );
}

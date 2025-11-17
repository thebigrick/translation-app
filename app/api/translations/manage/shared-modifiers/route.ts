import { NextRequest, NextResponse } from "next/server";
import { createGraphQLClient } from "@bigcommerce/translations-graphql-client";
import { getSessionFromContext } from "@/lib/auth";
import { extractNumericId } from "@/lib/utils/shared-modifier-helpers";

// GET - Fetch shared modifiers with translations
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const context = searchParams.get("context");
    const channelId = searchParams.get("channelId");
    const locale = searchParams.get("locale");

    if (!channelId || !locale) {
      return NextResponse.json(
        { error: "channelId and locale are required" },
        { status: 400 }
      );
    }

    if (!context) {
      return NextResponse.json(
        { error: "Context is required" },
        { status: 400 }
      );
    }

    const { accessToken, storeHash } = await getSessionFromContext(context);

    const graphqlClient = createGraphQLClient(accessToken, storeHash);

    console.log('[Shared Modifiers GET] Fetching with:', { channelId, locale });

    const result = await graphqlClient.getSharedProductModifiers({
      channelId: Number(channelId),
      locale,
      first: 50,
    });

    console.log('[Shared Modifiers GET] Result:', { 
      edgesCount: result.edges?.length || 0 
    });

    const modifiers = (result.edges || []).map((edge: any) => ({
      id: edge.node.id,
      displayName: edge.node.displayName,
      translation: edge.node.overridesForLocale?.displayName || "",
      __typename: edge.node.__typename,
      values: (edge.node.values || []).map((value: any) => {
        const numericValueId = extractNumericId(value.id);
        const overrideValue = edge.node.overridesForLocale?.values?.find(
          (v: any) => extractNumericId(v.id) === numericValueId
        );
        return {
          id: value.id,
          label: value.label,
          translation: overrideValue?.label || "",
        };
      }),
    }));

    console.log('[Shared Modifiers GET] Returning modifiers:', modifiers.length);
    return NextResponse.json(modifiers);
  } catch (error: any) {
    console.error("[Shared Modifiers GET] Error fetching shared modifiers:", error);
    console.error("[Shared Modifiers GET] Error details:", {
      message: error.message,
      stack: error.stack,
    });
    return NextResponse.json(
      { error: error.message || "Failed to fetch shared modifiers" },
      { status: 500 }
    );
  }
}

// PUT - Update shared modifier translation
export async function PUT(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const context = searchParams.get("context");
    const body = await request.json();

    const { modifierId, valueId, channelId, locale, translation, type } = body;

    if (!modifierId || !channelId || !locale || !type) {
      return NextResponse.json(
        { error: "modifierId, channelId, locale, and type are required" },
        { status: 400 }
      );
    }

    if (!context) {
      return NextResponse.json(
        { error: "Context is required" },
        { status: 400 }
      );
    }

    const { accessToken, storeHash } = await getSessionFromContext(context);

    const graphqlClient = createGraphQLClient(accessToken, storeHash);

    // Fetch modifier to get its type
    const modifierResult = await graphqlClient.getSharedProductModifiers({
      channelId: Number(channelId),
      locale,
      first: 1,
      ids: [modifierId],
    });

    if (!modifierResult.edges || modifierResult.edges.length === 0) {
      return NextResponse.json({ error: "Modifier not found" }, { status: 404 });
    }

    const modifierNode = modifierResult.edges[0]?.node;
    if (!modifierNode) {
      return NextResponse.json({ error: "Modifier not found" }, { status: 404 });
    }

    const modifierType = modifierNode.__typename;
    const fieldName = modifierType
      .replace("SharedProductModifier", "")
      .charAt(0).toLowerCase() + 
      modifierType.replace("SharedProductModifier", "").slice(1);

    let data: any = {};

    if (type === "displayName") {
      data[fieldName] = {
        displayName: translation || undefined,
      };
    } else if (type === "value" && valueId) {
      data[fieldName] = {
        values: [
          {
            valueId,
            label: translation,
          },
        ],
      };
    }

    await graphqlClient.setSharedProductModifiersInformation({
      channelId: Number(channelId),
      locale,
      modifiers: [
        {
          modifierId,
          type: modifierType,
          data,
        },
      ],
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating shared modifier translation:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update translation" },
      { status: 500 }
    );
  }
}


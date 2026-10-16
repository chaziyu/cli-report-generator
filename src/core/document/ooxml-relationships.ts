import JSZip from "jszip";

export interface OoxmlRelationship {
  id: string;
  type: string;
  target: string;
  targetMode?: string;
}

export class OoxmlRelationships {
  private relationships = new Map<string, OoxmlRelationship>();
  private maxIdNumber = 0;

  constructor(private relsXml: string) {
    this.parseRels(relsXml);
  }

  static fromXml(xml: string): OoxmlRelationships {
    return new OoxmlRelationships(xml);
  }

  private parseRels(xml: string): void {
    const relMatches = xml.matchAll(
      /<Relationship\s+([^>]+?)\s*\/?>/gi
    );

    for (const match of relMatches) {
      const attrsStr = match[1];
      const idMatch = attrsStr.match(/Id="([^"]+)"/i);
      const typeMatch = attrsStr.match(/Type="([^"]+)"/i);
      const targetMatch = attrsStr.match(/Target="([^"]+)"/i);
      const targetModeMatch = attrsStr.match(/TargetMode="([^"]+)"/i);

      if (idMatch && typeMatch && targetMatch) {
        const id = idMatch[1];
        const type = typeMatch[1];
        const target = targetMatch[1];
        const targetMode = targetModeMatch ? targetModeMatch[1] : undefined;

        this.relationships.set(id, { id, type, target, targetMode });

        // Track max numeric ID (e.g. rId12 -> 12)
        const numMatch = id.match(/^rId(\d+)$/i);
        if (numMatch) {
          const num = parseInt(numMatch[1], 10);
          if (num > this.maxIdNumber) {
            this.maxIdNumber = num;
          }
        }
      }
    }
  }

  getRelationship(id: string): OoxmlRelationship | undefined {
    return this.relationships.get(id);
  }

  getAll(): OoxmlRelationship[] {
    return Array.from(this.relationships.values());
  }

  /**
   * Finds an image relationship by target path (e.g. "media/image7.png").
   */
  findImageRelByTarget(targetPath: string): OoxmlRelationship | undefined {
    const clean = targetPath.replace(/^\/?word\//, "").replace(/^\//, "");
    for (const rel of this.relationships.values()) {
      const relClean = rel.target.replace(/^\/?word\//, "").replace(/^\//, "");
      if (relClean === clean || relClean.endsWith(clean) || clean.endsWith(relClean)) {
        return rel;
      }
    }
    return undefined;
  }

  /**
   * Adds an image relationship and returns the allocated rId.
   */
  addImageRelationship(mediaTargetPath: string): string {
    // Check if relationship for this target already exists
    const existing = this.findImageRelByTarget(mediaTargetPath);
    if (existing) {
      return existing.id;
    }

    this.maxIdNumber++;
    const newId = `rId${this.maxIdNumber}`;
    const cleanTarget = mediaTargetPath.replace(/^\/?word\//, "").replace(/^\//, "");

    const newRel: OoxmlRelationship = {
      id: newId,
      type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
      target: cleanTarget.startsWith("media/") ? cleanTarget : `media/${cleanTarget}`,
    };

    this.relationships.set(newId, newRel);
    return newId;
  }

  /**
   * Replaces an existing relationship target.
   */
  updateRelationshipTarget(id: string, newTarget: string): boolean {
    const rel = this.relationships.get(id);
    if (!rel) return false;
    rel.target = newTarget;
    return true;
  }

  /**
   * Serializes relationships back to valid XML.
   */
  toXml(): string {
    const items = Array.from(this.relationships.values())
      .map((r) => {
        const modeAttr = r.targetMode ? ` TargetMode="${r.targetMode}"` : "";
        return `  <Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"${modeAttr}/>`;
      })
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n${items}\n</Relationships>`;
  }

  /**
   * Ensures [Content_Types].xml in the ZIP archive contains PNG image mapping.
   */
  static async ensurePngContentType(zip: JSZip): Promise<void> {
    const contentTypesEntry = zip.file("[Content_Types].xml");
    if (!contentTypesEntry) return;

    let contentTypesXml = await contentTypesEntry.async("string");
    if (!contentTypesXml.includes('Extension="png"') && !contentTypesXml.includes('Extension="PNG"')) {
      contentTypesXml = contentTypesXml.replace(
        /<\/Types>/i,
        '  <Default Extension="png" ContentType="image/png"/>\n</Types>'
      );
      zip.file("[Content_Types].xml", contentTypesXml);
    }
  }
}

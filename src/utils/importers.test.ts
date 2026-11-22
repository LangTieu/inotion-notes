import { describe, expect, it } from 'vitest'
import { parseEnex, parseMarkdownFile, runLimited } from './importers'

describe('importers',()=>{
 it('parses frontmatter, tags, and nested Obsidian folders',()=>{const item=parseMarkdownFile('Vault/Projects/Plan.md',"---\ntitle: Plan\ntags:\n  - work\ncreated_at: 2024-01-01\n---\nText");expect(item.title).toBe('Plan');expect(item.folder).toBe('Vault/Projects');expect(item.tags).toEqual(['work']);expect(item.created_at).toBe('2024-01-01')})
 it('strips Joplin and Notion hex suffixes',()=>{const item=parseMarkdownFile('Folder abcdabcdabcdabcdabcdabcdabcdabcd/Page 12341234123412341234123412341234.md','Body');expect(item.folder).toBe('Folder');expect(item.title).toBe('Page')})
 it('converts ENEX resources to files and strips unsafe markup',async()=>{const report=await parseEnex('<en-export><note><title>Note</title><content>&lt;en-note&gt;&lt;script&gt;bad()&lt;/script&gt;&lt;p&gt;Safe&lt;/p&gt;&lt;/en-note&gt;</content><tag>work</tag><resource><data>aGk=</data><mime>text/plain</mime><resource-attributes><file-name>hello.txt</file-name></resource-attributes></resource></note></en-export>');expect(report.notes[0].body_md).not.toContain('bad()');expect(report.notes[0].body_md).toContain('Safe');expect(report.notes[0].tags).toEqual(['work']);expect(await report.notes[0].attachments[0].text()).toBe('hi')})
 it('limits concurrent batch work to three',async()=>{let active=0,max=0;await runLimited([1,2,3,4,5,6],3,async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--});expect(max).toBeLessThanOrEqual(3)})
})

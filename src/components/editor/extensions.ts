"use client";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import {
  Table,
  TableRow,
  TableCell,
  TableHeader,
} from "@tiptap/extension-table";
import { ImageAsset, PoetryVerse, Citation, Callout } from "./literary-nodes";
import { Node, Extension, mergeAttributes } from "@tiptap/core";
import { editorVideo } from "@/lib/editor/client-document";
const Direction = Extension.create({
  name: "direction",
  addGlobalAttributes() {
    return [
      {
        types: [
          "paragraph",
          "heading",
          "blockquote",
          "poetry",
          "callout",
          "footnote",
        ],
        attributes: {
          dir: {
            default: "rtl",
            parseHTML: (e) => e.getAttribute("dir"),
            renderHTML: (a) => ({ dir: a.dir }),
          },
        },
      },
    ];
  },
});
function block(name: string) {
  return Node.create({
    name,
    group: "block",
    content: "block+",
    parseHTML() {
      return [{ tag: `aside.editor-${name}` }];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        "aside",
        mergeAttributes(HTMLAttributes, { class: `editor-${name}` }),
        0,
      ];
    },
  });
}
const Video = Node.create({
  name: "video",
  group: "block",
  atom: true,
  addAttributes() {
    return { src: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "iframe" }];
  },
  renderHTML({ node }) {
    const src = editorVideo(node.attrs.src);
    return src
      ? ["iframe", { src, title: "فيديو", loading: "lazy" }]
      : ["span", { class: "invalid-editor-media" }, "فيديو غير متاح"];
  },
});
export function editorialExtensions() {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableCell,
    TableHeader,
    ImageAsset,
    Direction,
    Callout,
    PoetryVerse,
    Citation,
    block("poetry"),
    block("footnote"),
    Video,
  ];
}

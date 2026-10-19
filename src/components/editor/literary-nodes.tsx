"use client";
import { Node } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import Image from "@tiptap/extension-image";
import NextImage from "next/image";
import { editorImage, editorLink } from "@/lib/editor/client-document";
function Field({
  props,
  name,
  label,
  long = false,
}: {
  props: NodeViewProps;
  name: string;
  label: string;
  long?: boolean;
}) {
  const value = String(props.node.attrs[name] || "");
  return (
    <label>
      {label}
      {long ? (
        <textarea
          dir="auto"
          value={value}
          maxLength={100000}
          onChange={(e) => props.updateAttributes({ [name]: e.target.value })}
        />
      ) : (
        <input
          dir={name === "url" ? "ltr" : "auto"}
          value={value}
          maxLength={name === "url" ? 2000 : 300}
          onChange={(e) => props.updateAttributes({ [name]: e.target.value })}
        />
      )}
    </label>
  );
}
function Remove({ props }: { props: NodeViewProps }) {
  return (
    <button type="button" onClick={() => props.deleteNode()}>
      إزالة المكوّن
    </button>
  );
}
function VerseView(props: NodeViewProps) {
  return (
    <NodeViewWrapper className="literary-node" contentEditable={false}>
      <fieldset>
        <legend>بيت شعري</legend>
        <div className="verse-fields">
          <Field props={props} name="first" label="الشطر الأول" long />
          <Field props={props} name="second" label="الشطر الثاني" long />
        </div>
        <label>
          حجم خط البيت
          <select
            value={props.node.attrs.size}
            onChange={(e) => props.updateAttributes({ size: e.target.value })}
          >
            <option value="small">صغير</option>
            <option value="normal">عادي</option>
            <option value="large">كبير</option>
          </select>
        </label>
        <Remove props={props} />
      </fieldset>
    </NodeViewWrapper>
  );
}
export const PoetryVerse = Node.create({
  name: "poetryVerse",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      first: { default: "" },
      second: { default: "" },
      size: { default: "normal" },
    };
  },
  parseHTML() {
    return [{ tag: "div.editor-poetry-verse", getAttrs: () => false }];
  },
  renderHTML({ node }) {
    return [
      "div",
      { class: "editor-poetry-verse", dir: "rtl" },
      ["span", {}, String(node.attrs.first)],
      ["span", {}, String(node.attrs.second)],
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(VerseView);
  },
});
function CitationView(props: NodeViewProps) {
  return (
    <NodeViewWrapper className="literary-node" contentEditable={false}>
      <fieldset>
        <legend>اقتباس موثّق</legend>
        <Field props={props} name="quote" label="نص الاقتباس" long />
        <Field props={props} name="author" label="اسم القائل" />
        <Field props={props} name="book" label="اسم الكتاب" />
        <Field props={props} name="page" label="صفحة الاقتباس" />
        <Field props={props} name="url" label="رابط توثيق الاقتباس" />
        <Remove props={props} />
      </fieldset>
    </NodeViewWrapper>
  );
}
export const Citation = Node.create({
  name: "citation",
  group: "block",
  atom: true,
  addAttributes() {
    return Object.fromEntries(
      ["quote", "author", "book", "page", "url"].map((key) => [
        key,
        { default: "" },
      ]),
    );
  },
  parseHTML() {
    return [{ tag: "figure.editor-citation", getAttrs: () => false }];
  },
  renderHTML({ node }) {
    const a = node.attrs;
    const link = editorLink(a.url);
    return [
      "figure",
      { class: "editor-citation" },
      ["blockquote", {}, String(a.quote)],
      [
        "figcaption",
        {},
        [a.author, a.book, a.page].filter(Boolean).join(" — "),
        ...(link
          ? [
              [
                "a",
                { href: link, rel: "noopener noreferrer nofollow" },
                "المصدر",
              ],
            ]
          : []),
      ],
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CitationView);
  },
});
function CalloutView(props: NodeViewProps) {
  return (
    <NodeViewWrapper
      className={`editor-callout callout-${props.node.attrs.kind}`}
    >
      <div contentEditable={false}>
        <label>
          نوع التنبيه
          <select
            value={props.node.attrs.kind}
            onChange={(e) => props.updateAttributes({ kind: e.target.value })}
          >
            <option value="info">معلومة مهمة</option>
            <option value="note">توضيح</option>
            <option value="warning">تنبيه</option>
            <option value="author">ملاحظة الكاتب</option>
          </select>
        </label>
        <Field props={props} name="title" label="عنوان التنبيه" />
      </div>
      <NodeViewContent />
      <div contentEditable={false}>
        <Remove props={props} />
      </div>
    </NodeViewWrapper>
  );
}
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  addAttributes() {
    return { kind: { default: "info" }, title: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "aside.editor-callout" }];
  },
  renderHTML() {
    return ["aside", { class: "editor-callout" }, 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});
function AssetView(props: NodeViewProps) {
  const src = editorImage(props.node.attrs.assetId);
  return (
    <NodeViewWrapper className="literary-node" contentEditable={false}>
      <fieldset>
        <legend>صورة المقال</legend>
        {src && (
          /* Internal authenticated image URL; its size is constrained by editor CSS. */ <NextImage
            unoptimized
            width={960}
            height={640}
            src={src}
            alt={String(props.node.attrs.alt || "")}
            loading="lazy"
          />
        )}
        <Field props={props} name="alt" label="وصف الصورة البديل" />
        <Field props={props} name="caption" label="تعليق الصورة" />
        <Remove props={props} />
      </fieldset>
    </NodeViewWrapper>
  );
}
export const ImageAsset = Image.extend({
  renderHTML({ node }) {
    const src = editorImage(node.attrs.assetId);
    return src
      ? ["img", { src, alt: String(node.attrs.alt || ""), loading: "lazy" }]
      : ["span", {}, "صورة غير متاحة"];
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      assetId: { default: null },
      caption: { default: "" },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(AssetView);
  },
});

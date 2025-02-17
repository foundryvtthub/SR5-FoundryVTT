export class SR5TestingDocuments<DocumentType> {
        documentClass: DocumentType;
        documents: foundry.abstract.Document<any>[] = [];

        constructor(documentClass) {
            this.documentClass = documentClass;
        }

        async create(data): Promise<DocumentType> {
            // @ts-ignore
            const document = await this.documentClass.create({name: `#QUENCH_TEST_DOCUMENT_SHOULD_HAVE_BEEN_DELETED`, ...data, ...{folder: this.folder}});
            this.documents.push(document);
            return document;
        }

        async teardown() {
            // @ts-ignore
            this.documents.forEach(document => document.delete());
        }
    }
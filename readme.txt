the data base is in  SQLite 

to running: 
npm install
npm start

APIs:

requirement 1 : POST http://localhost:4000/api/module/samples/ param body > type JSON > {  "owner": "raul",  "files": ["file1.txt", "docs.doc"]}

requirement 2 : POST http://localhost:4000/api/module/samples/access/{ea1c69e2-adbc-4868-a346-967c0dd9b7f9} param body > type JSON > { "userId":"107445" }

requirement 3 : POST http://localhost:4000/api/module/files/qc/{97971259-9f2a-4438-83c7-5aa4666cfc46} param body > type JSON > { "status": "passed" }

requirement 4 : get http://localhost:4000/api/module/download-request param body > type JSON > {"userId": "107445","fileId": "c8447115-99d5-4a1e-b5b6-593716e27388"
    }